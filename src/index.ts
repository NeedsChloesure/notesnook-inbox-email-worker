import * as PostalMime from "postal-mime";
import {getInboxPublicEncryptionKey, encrypt, postEncryptedInboxItem} from "../nn-inbox-cloudflare-workers/src/index.js"
import { getUser, getOrCreateUser, adminDBOperation, updateUserLastUsed, updateUserOptions } from "./db.js";
import { z } from "zod";
import {DOMAIN, ATTACHMENT_SIZE_LIMIT, NOTE_SIZE_LIMIT, INACTIVE_USER_TIMEOUT} from "./config.js";
import { parseHTML } from "linkedom";
import { mimeToLanguage } from "./language.js";

export const USER_OPTIONS = z.object({
	tags: z.array(z.string()).optional(),
	notebooks: z.array(z.string()).optional(),
    archived: z.boolean().optional(),
    favorited: z.boolean().optional(),
    readonly: z.boolean().optional(),
    pinned: z.boolean().optional()
})

type rejectedAttachment = {
	reason: string
}

type foundAttachment = {
	data?: string,
	meta: {
		attachmentId: string | undefined,
		mime: string,
		isImage?: boolean,
		name: string | null
		isRejected?: rejectedAttachment
	}
}

function prettyDate(): string{
	const now = new Date();

	const date =
	now.toLocaleDateString("en-GB", {
		day: "2-digit",
		month: "short",
		year: "numeric",
	});

	const time =
	now.toLocaleTimeString("en-GB", {
		hour: "2-digit",
		minute: "2-digit",
		hour12: false,
	});

	const formatted = date.replace(/ (\d{4})$/, ", $1") + " at " + time;
	return formatted;
}

function rejectEmail(email: ForwardableEmailMessage, reason: string){
	email.setReject(reason)
	return
}

async function routeApi(request: Request, env: Env, ctx: ExecutionContext): Promise<Response>{
	const url = new URL(request.url)
	const headers = request.headers
	const auth = headers.get("authorization");
	const db = env.notesnook_inbox.withSession();
	if (!auth?.startsWith("Bearer nn__")) {
		return Response.json({ success: false, error: "Invalid Authorization header." }, { status: 401 });
	}
	const apikey = auth.slice("Bearer ".length);
	switch (url.pathname){
		case ("/api/getUser"): {
			if (!(request.method === "GET")){
				return Response.json({success: false, error: "Invalid method"}, {status: 405})
			}
			try {
			const publicKey = await getInboxPublicEncryptionKey(apikey, env["Notesnook-Server-Url"])
			if (!publicKey) {
				return Response.json({success:false, error: "Your api key appears to be invalid."}, {status: 401});
			}
			const user = await getOrCreateUser(apikey, db);
			ctx.waitUntil(updateUserLastUsed(apikey, db));
			return Response.json({success: true, user: user});
			} catch (err) {
				console.error(String(err));
				return Response.json({success:false, error: "Api key validation failed. This error can be transient if Notesnook's servers are unavailable, try again in about 1 minute."}, {status: 503});
			}

		}
		case ("/api/updateUser"): {
			if (!(request.method === "POST")) {
				return Response.json({success: false, error: "Invalid method"}, {status: 405})
			}
			try {
			const publicKey = await getInboxPublicEncryptionKey(apikey, env["Notesnook-Server-Url"]);
			if (!publicKey) {
				return Response.json({success:false, error: "Your api key appears to be invalid."}, {status: 401});
			}} catch(err){
				return Response.json({success:false, error: "Api key validation failed. This error can be transient if Notesnook's servers are unavailable, try again in about 1 minute."}, {status: 503});
			}
			const body: unknown = await request.json();
			const validBody = USER_OPTIONS.safeParse(body);
			if (!validBody.success) {
				return Response.json({success: false, error: {message: "Invalid options", details: validBody.error}}, {status: 400});
			}
			await updateUserOptions(apikey, validBody.data, db);
			ctx.waitUntil(updateUserLastUsed(apikey, db));
			return Response.json({success:true});
		}
		default: {
			return Response.json({success: false, error: "Could not handle your request."}, {status: 404})
		}
	}
}

async function routeAdmin(request: Request, env: Env){
	const url = new URL(request.url)
	const db = env.notesnook_inbox.withSession()
	switch (url.pathname){
		case ("/admin-api/init"): {
			try {
			await adminDBOperation("init", db);
			return Response.json({success: true});
			} catch (err) {
				console.error(err)
				return Response.json({success: false, details: String(err)}, {status: 500})
			}
		}
		case ("/admin-api/upgrade"): {
			try {
			await adminDBOperation("upgrade", db);
			return Response.json({success: true});
			} catch (err) {
				console.error(err)
				return Response.json({success: false, details: String(err)}, {status: 500})
			}
		}
		default: {
			return Response.json({success: false}, {status: 404})
		}
	}
}

function buildNoteHTML(text: string, parsedEmail: PostalMime.Email): string{
	const { document, HTMLImageElement } = parseHTML(text)
	// In case of a poorly formed html (many popular providers), try to make it well formed.
	if (!document.querySelector("body")) {
		const html = document.querySelector("html") ?? document.createElement("html");
		const body = document.createElement("body");
		while (document.firstChild) {
			body.appendChild(document.firstChild);
		}
		html.appendChild(body);
		document.appendChild(html);
	}
	let appended = false;
	// Adds a separator before the first attachment that gets rendered outside of the note contents.
	const appendSeparator = () => {
		if (!appended){
			document.body.appendChild(document.createElement("hr"));
		}
		appended = true;
	}
	// Hand the attachments over one at a time so each decoded buffer can be dropped as
	// soon as it has been embedded into the note.
	const attachments = parsedEmail.attachments;
	parsedEmail.attachments = [];
	for (const attach of attachments){
		const attachment = serializeAttachment(attach);
		attach.content = new ArrayBuffer(0);
		if (attachment.meta.isRejected){
			appendSeparator();
			const h3 = document.createElement("h3");
			const p = document.createElement("p");
			h3.textContent = `Rejected attachment ${attachment.meta.name ?? ""}`
			p.textContent = attachment.meta.isRejected.reason;
			document.body.appendChild(h3);
			document.body.appendChild(p);
			continue;
		}
		const cid = attachment.meta.attachmentId?.replace(/^<|>$/g, "");
		if (attachment.meta.isImage){
			if (cid && text.includes(cid) && attachment.meta.attachmentId){
				const img = document.querySelector(`img[src="cid:${cid}"]`)
				if (img instanceof HTMLImageElement){
					img.src = `data:${attachment.meta.mime};base64,${attachment.data}`;
					continue;
				}
			}
			appendSeparator();
			const h3 = document.createElement("h3");
			h3.textContent = attachment.meta.name;
			const img = document.createElement("img");
			img.src = `data:${attachment.meta.mime};base64,${attachment.data}`;
			document.body.appendChild(h3);
			document.body.appendChild(img);
			continue;
		}
		appendSeparator();
		const pre = document.createElement("pre");
		const h3 = document.createElement("h3");
		h3.textContent = attachment.meta.name;
		pre.className = mimeToLanguage(attachment.meta.mime);
		pre.dataset.blockId = crypto.getRandomValues(new Uint8Array(6)).toBase64()
		pre.dataset.indentType = "space";
		pre.dataset.indentLength = "2";

		const code = document.createElement("code");
		if (!attachment.data){
			continue;
		}
		code.textContent = attachment.data;

		pre.appendChild(code);
		document.body.appendChild(h3);
		document.body.appendChild(pre);
	}
	return document.toString();
}

function createAttachmentObject(data: string, attachment: PostalMime.Attachment): foundAttachment {
	if (attachment.mimeType.startsWith("image/")){
		return {data: data, meta: {attachmentId: attachment.contentId, mime:attachment.mimeType, name: attachment.filename, isImage: true}}
	} if (attachment.mimeType.startsWith("text/")) {
		return {data: data, meta: {attachmentId: attachment.contentId, mime:attachment.mimeType, name: attachment.filename, isImage: false}}
	} else {
		return {meta: {attachmentId: attachment.contentId, mime: attachment.mimeType, name: attachment.filename, isRejected: {reason: "Attachment is not text or image."}}}
	}
}

function getAttachmentSize(attachment: string | Uint8Array | ArrayBuffer): number {
	if (typeof attachment === "string") return Math.floor(attachment.length / (4/3));
	return attachment.byteLength;
}

function serializeAttachment(attachment: PostalMime.Attachment): foundAttachment {
	if (getAttachmentSize(attachment.content) > ATTACHMENT_SIZE_LIMIT) return {meta: {attachmentId: attachment.contentId, mime: attachment.mimeType, name: attachment.filename, isRejected: {reason: "Attachment too big."}}};
	if (attachment.content instanceof ArrayBuffer){
		const bytes = new Uint8Array(attachment.content);
		if (attachment.mimeType.startsWith("text/")){
			const decoder = new TextDecoder();
			return createAttachmentObject(decoder.decode(bytes), attachment);
		}
		return createAttachmentObject(bytes.toBase64(), attachment);
	}
	if (typeof attachment.content === "string"){
		console.error("Unexpected attachment type. We shouldn't be here! (content type is string?)");
		if (attachment.mimeType.startsWith("text/")){
			const decoder = new TextDecoder();
			const bytes = Uint8Array.fromBase64(attachment.content);
			const attachment_data = createAttachmentObject(decoder.decode(bytes), attachment);
			return attachment_data; // see below comment
		}
		const attachment_data = createAttachmentObject(attachment.content, attachment);
		return attachment_data; // I am just assuming it's base64 but fuck who knows.
		// I have never seen this trail during testing.
	}
	if (attachment.content instanceof Uint8Array){
		const bytes = attachment.content;
		if (attachment.mimeType.startsWith("text/")){
			const decoder = new TextDecoder();
			return createAttachmentObject(decoder.decode(bytes), attachment);
		}
		return createAttachmentObject(bytes.toBase64(), attachment);
	}
	else {
		console.error("Unknown content type!");
		console.error(typeof attachment.content);
		return {meta:{attachmentId: attachment.contentId, isRejected: {reason: "Handled exception (Something happened). You should report this as a bug, please include information like the email address you sent the message to when reporting."}, name: attachment.filename, mime: attachment.mimeType}};
	}
}

function parseForHTML(text:string | undefined): string | undefined {
	/*
	Wraps text in paragraph blocks.
	*/
	if (text == undefined){
		return;
	}
	text = text
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;")
		.split("\n")
		.map(line => `<p>${line}</p>`)
		.join("");
	return text;
}

export default {
	async fetch(request, env, ctx): Promise<Response> {
		const url = new URL(request.url)
		if (url.pathname.startsWith("/api/")){
			const returnedResponse = await routeApi(request, env, ctx)
			return returnedResponse
		}
		if (url.pathname.startsWith("/apimeta")){
			const metainfo = await env.notesnook_inbox_kv.get("stats")
			if (!metainfo){
				return Response.json({instance: env["Notesnook-Server-Url"], count: 0})
			}
			return Response.json(JSON.parse(metainfo))
		}
		if (url.pathname.startsWith("/admin-api/")){
			const headers = request.headers

			if (headers.get("Authorization") == `Bearer ${env.Admin_Secret_Key}`){
				const returnedResponse = await routeAdmin(request, env);
				return returnedResponse;
			} else {
				return Response.json({success: false, error: "Not authorized."})
			}
		}
		return new Response("Hello World!", {status: 404});
	},
	async email(email, env, ctx): Promise<void>{
		const db = env.notesnook_inbox.withSession()
		const parser = new PostalMime.default();
		const sender = email.from;
		const recipient = email.to.toLowerCase(); // legacy, required for v0.0.0 emails, where they may have capitalization.
		if (!recipient.endsWith(DOMAIN)){
			return;
		}
		const parsedEmail = await parser.parse(email.raw)
		const subject = parsedEmail.subject || `Note from ${sender} on ${prettyDate()}`
		const returnedValue = await getUser(recipient, db)
		if (!returnedValue){
			rejectEmail(email, "There is no record associated with this email in the database.\n Emails are cleared on a daily basis and are removed after 30 days of inactivity.")
			return
		}
		const apikey = returnedValue.apikey;
		const note_object = {
			title: subject,
			content:{
				type: "html",
				data: parsedEmail.html || parseForHTML(parsedEmail.text) || "<p>Email contained no body?</p>"
			},
			version: 1,
			source: `email from ${sender}`,
			type: "note",
			pinned: returnedValue.options?.pinned || false,
			readonly: returnedValue.options?.readonly || false,
			archived: returnedValue.options?.archived || false,
			favorite: returnedValue.options?.favorited || false,
			notebookIds: returnedValue.options?.notebooks || [],
			tagIds: returnedValue.options?.tags || []
		}
		const pubkey = await getInboxPublicEncryptionKey(apikey, env["Notesnook-Server-Url"])
		if (!pubkey){
			rejectEmail(email, "Could not resolve public key.\n Is your API key still valid?\n This email address is only good for the API key it was created for.")
			return
		}
		note_object.content.data = buildNoteHTML(note_object.content.data, parsedEmail)
		const note_object_string = JSON.stringify(note_object)
		if (note_object_string.length > NOTE_SIZE_LIMIT + 500_000){ // magic number is to give some leeway for my transformations, like adding attachments to the end.
			console.warn(`Oversize object permitted. Size: ${note_object_string.length}`); // do something later
		}
		const serverMessage = await encrypt(note_object_string, pubkey)
		await postEncryptedInboxItem(apikey, serverMessage, env["Notesnook-Server-Url"])
		ctx.waitUntil(updateUserLastUsed(recipient, db))

		//console.log("sent event: " + JSON.stringify(note_object));
		},
	async scheduled(scheduled, env, ctx){
		switch (scheduled.cron) {
			case ("0 23 * * *"): {
				// clean up expired users
				const expiry = Date.now() - INACTIVE_USER_TIMEOUT;
				const db = env.notesnook_inbox // not using a session here because we can (and likely should) make deletion very explicit.
				const users = await db.prepare("DELETE FROM users WHERE last_used < ?").bind(expiry).run();
				console.log(`Deleted ${users.meta.rows_written} entries.`)
				return;
			}
			case ("5 23 * * *"): {
				// update cached instance stats in kv.
				const db = env.notesnook_inbox.withSession();
				const users = await db.prepare("SELECT COUNT(*) AS count FROM users").first<{count: number}>()
				await env.notesnook_inbox_kv.put("stats", JSON.stringify({instance: env["Notesnook-Server-Url"], count: users?.count ?? 0}))
				return;
			}
			default: {
				console.error(`Unhandled cron expression run at ${scheduled.cron}`)
			}
		}
	}
} satisfies ExportedHandler<Env>;
