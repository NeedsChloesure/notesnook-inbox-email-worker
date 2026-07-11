import * as PostalMime from "postal-mime";
import {getInboxPublicEncryptionKey, encrypt, postEncryptedInboxItem} from "../nn-inbox-cloudflare-workers/src/index.js"
import { getUser, getOrCreateUser, adminDBOperation, updateUserLastUsed, updateUserOptions } from "./db.js";
import { success, z } from "zod";
import {DOMAIN, ATTACHMENT_SIZE_LIMIT, NOTE_SIZE_LIMIT, INACTIVE_USER_TIMEOUT} from "./config.js";

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
		isInline?: boolean,
		name: string | null
		isRejected?: rejectedAttachment
	}
}

export type serverStats = {
	instance: string,
	activeAccounts: number
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
				return Response.json({success:false, error: "Your api key appears to be invalid."}, {status: 401})
			}
			const user = await getOrCreateUser(apikey, db)
			return Response.json({success: true, user: user})
			} catch (err) {
				console.error(String(err))
				return Response.json({success:false, error: "Api key validation failed. This error can be transient if Notesnook's servers are unavailable, try again in about 1 minute."}, {status: 503})
			}

		}
		case ("/api/updateUser"): {
			if (!(request.method === "POST")) {
				return Response.json({success: false, error: "Invalid method"}, {status: 405})
			}
			const body: unknown = await request.json()
			const validBody = USER_OPTIONS.safeParse(body)
			if (!validBody.success) {
				return Response.json({success: false, error: {message: "Invalid options", details: validBody.error}}, {status: 400})
			}
			await updateUserOptions(apikey, validBody.data, db)
			ctx.waitUntil(updateUserLastUsed(apikey, db))
			return Response.json({success:true})
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
	const attachmentsData: foundAttachment[] = []
	for (const attach of parsedEmail.attachments){
			attachmentsData.push(serializeAttachment(attach))
	}
	if (attachmentsData.length > 0){
		text += "<hr>"
	}
	for (const attachment of attachmentsData){
		if (attachment.meta.isRejected){
			text = attachToEnd(false, attachment, text)
			continue;
		}
		const cid = attachment.meta.attachmentId?.replace(/^<|>$/g, "")
		if (attachment.meta.isImage){
			if (attachment.meta.isInline && attachment.meta.attachmentId){
				//const pos = text.indexOf(`cid:${cid}`);
				if (!text.includes(`cid:${cid}`)){
					text = attachToEnd(true, attachment, text)
				} else {
					text = text.replace(`cid:${cid}`, `data:${attachment.meta.mime};base64,${attachment.data}`)
				}
			} else {
				text = attachToEnd(true, attachment, text)
			}
		} else {
			text = attachToEnd(false, attachment, text)
		}
	}
	return text
}

function createAttachmentObject(data: string, attachment: PostalMime.Attachment): foundAttachment {
	if (data.length > ATTACHMENT_SIZE_LIMIT){
		// early reject
		return {meta: {attachmentId: attachment.contentId, mime: attachment.mimeType, name: attachment.filename, isRejected: {reason: "Attachment too big."}}}
	} else {
		if (attachment.mimeType.startsWith("image/")){
			return {data: data, meta: {attachmentId: attachment.contentId, mime:attachment.mimeType, name: attachment.filename, isImage: true, isInline: attachment.disposition?.startsWith("inline") ?? false}}
		} if (attachment.mimeType.startsWith("text/")) {
			return {data: data, meta: {attachmentId: attachment.contentId, mime:attachment.mimeType, name: attachment.filename, isImage: false, }}
		} else {
			return {meta: {attachmentId: attachment.contentId, mime: attachment.mimeType, name: attachment.filename, isRejected: {reason: "Attachment is not text or image."}}}
		}
	}
}

function serializeAttachment(attachment: PostalMime.Attachment): foundAttachment {
	if (typeof attachment.content === "string"){
		console.error("Unexpected attachment type.", "We shouldn't be here!");
		//return {meta: {isRejected: {reason: "Unexpected attachment type (string). You should report this as a bug."}, mime: attachment.mimeType, attachmentId:attachment.contentId, name: attachment.filename}}
		if (attachment.mimeType.startsWith("text/")){
			const decoder = new TextDecoder();
			const bytes = Uint8Array.fromBase64(attachment.content)
			const attachment_data = createAttachmentObject(decoder.decode(bytes), attachment)
			return attachment_data // see below comment
		}
		const attachment_data = createAttachmentObject(attachment.content, attachment)
		return attachment_data; // I am just assuming it's base64 but fuck who knows.
		// I have never seen this trail during testing.
	}
	if (attachment.content instanceof Uint8Array){
		const bytes = attachment.content;
		if (attachment.mimeType.startsWith("text/")){
			const decoder = new TextDecoder()
			return createAttachmentObject(decoder.decode(bytes), attachment)
		}
		return createAttachmentObject(bytes.toBase64(), attachment);
	}
	if (attachment.content instanceof ArrayBuffer){
		const bytes = new Uint8Array(attachment.content);
		if (attachment.mimeType.startsWith("text/")){
			const decoder = new TextDecoder()
			return createAttachmentObject(decoder.decode(bytes), attachment)
		}
		return createAttachmentObject(bytes.toBase64(), attachment);
	}
	else {
		console.error("Unknown content type!")
		console.error(typeof attachment.content)
		//console.error(attachment)
		return {meta:{attachmentId: attachment.contentId, isRejected: {reason: "Handled exception (Something happened). You should report this as a bug, please include information like the email address you sent the message to when reporting."}, name: attachment.filename, mime: attachment.mimeType}}
	}
}

function attachToEnd(isImage: boolean, attachment: foundAttachment, text: string): string {
	if (attachment.meta.isRejected){
		let heading;
		if (attachment.meta.name) {
			heading = `<h3>Rejected attachment: ${parseForHTML(attachment.meta.name)}</h3>`
		} else {
			heading = "<h3> Rejected attachment </h3>"
		}
		return text+heading+`<p>${attachment.meta.isRejected.reason}</p>`
	} if (isImage){
		let heading;
		if (attachment.meta.name) {
			heading = `<h3>${parseForHTML(attachment.meta.name)}</h3>`
		} else {
			heading = "<h3> Image </h3>"
		}
		const imgBlock = `<img src="data:${attachment.meta.mime};base64,${attachment.data}"/>`
		return text+heading+imgBlock;
	} else { //if (!isImage) {
		let heading;
		if (attachment.meta.name) {
			heading = `<h3>${parseForHTML(attachment.meta.name)}</h3>`
		} else {
			heading = `<h3> Text (${parseForHTML(attachment.meta.mime)}) </h3>`
		}
		const blockId = crypto.getRandomValues(new Uint8Array(6)).toBase64()
		const textBlock = `<pre data-block-id=\"${blockId}\" data-indent-type=\"space\" data-indent-length=\"2\" class=\"plaintext\"><code>${parseForCodeblock(attachment.data)}</code></pre>`
		return text+heading+textBlock;
	}
}

function parseForCodeblock(text: string | undefined): string | undefined {
	if (text === undefined){
		return;
	}
	return text.replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;")
}

function parseForHTML(text:string | undefined): string | undefined {
	if (text === undefined){
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
		const subject = email.headers.get("subject") || `Note from ${sender} on ${prettyDate()}`
		const rawEmail = new Response(email.raw)
		const parsedEmail = await parser.parse(await rawEmail.arrayBuffer())
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
			console.warn("Oversize object permitted.") // do something later
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
