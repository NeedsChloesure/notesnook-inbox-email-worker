export type returnedUserDocument = {
	apikey: string,
    email: string,
	options?: userOptions,
    last_used: number
};

type databaseReturnedInfo = {
    apikey: string,
    email: string,
    options?: string,
    last_used: number,
    id: number
}

export type userOptions = {
	tags?: string[],
	notebooks?: string[],
    archived?: boolean,
    favorited?: boolean,
    readonly?: boolean,
    pinned?: boolean
};

import {DOMAIN} from "./config.js"

export const oneDay = 86400000;

function randomVariance(): number {
    // include variance in the last used timestamps.
    // these are only used for garbage collection and are not intended to be accurate.
    return Math.floor(oneDay * Math.random());
}

function convertDatabaseReturn(info: databaseReturnedInfo): returnedUserDocument {
    const { id, options, ...rest } = info;
    return {
        ...rest,
        options: options ? JSON.parse(options) : undefined,
    };
}

export async function getUser(
    email: string,
    db: D1DatabaseSession
): Promise<returnedUserDocument> {
    const result = await db
        .prepare("SELECT * FROM users WHERE LOWER(email) = ?")
        .bind(email)
        .first<databaseReturnedInfo>();

    if (!result) {
        throw new Error("No apikey associated with this email.");
    }
    return convertDatabaseReturn(result);
}

export async function updateUserOptions(apikey: string, options: userOptions, db: D1DatabaseSession): Promise<void> {
    await db.prepare("UPDATE users SET options = ? WHERE apikey = ?").bind(JSON.stringify(options), apikey).run();
}

export async function createUser(apikey: string, db: D1DatabaseSession): Promise<returnedUserDocument | null> {
    // email, key, options, last_used
    const preparedInsert = db.prepare("INSERT INTO users (email, apikey, options, last_used) VALUES (?, ?, ?, ?)");
    const currentDate = Date.now();
    const last_used = currentDate + randomVariance();
    const email = crypto.getRandomValues(new Uint8Array(20)).toBase64({alphabet: "base64url", omitPadding: true}).toLowerCase() + "@" + DOMAIN;
    const result = await preparedInsert.bind(email, apikey, "{}", last_used).run()
    if (!result.success){
        console.error("User creation has failed?")
        return null
    }
    return {apikey: apikey, email: email, options: {}, last_used: last_used}
}

export async function getOrCreateUser(apikey: string, db: D1DatabaseSession): Promise<returnedUserDocument> {
    const preparedSelect = db.prepare("SELECT * FROM users WHERE apikey = ?")
    const result = await preparedSelect.bind(apikey).first<databaseReturnedInfo>()
    if (!result){
        // need to create user
        for (let attempt = 0; attempt < 2; attempt++){
            const userCreationResult = await createUser(apikey, db);
            if (userCreationResult){
                return userCreationResult;
            }
        
        }
    throw new Error("Failed to create user after two attempts.")
    }
    return convertDatabaseReturn(result);
}

export async function updateUserLastUsed(emailOrApikey: string, db: D1DatabaseSession): Promise<void> {
    if (emailOrApikey.includes("@")){
    const updateThreshold = Date.now() - oneDay;
    const lastUsed = Date.now() + randomVariance();
    const preparedStatement = await db.prepare("UPDATE users SET last_used = ? WHERE email = ? AND last_used < ?").bind(lastUsed, emailOrApikey, updateThreshold).run();
} else {
    const updateThreshold = Date.now() - oneDay;
    const lastUsed = Date.now() + randomVariance();
    const preparedStatement = await db.prepare("UPDATE users SET last_used = ? WHERE apikey = ? AND last_used < ?").bind(lastUsed, emailOrApikey, updateThreshold).run();
}
}

export async function adminDBOperation(operation: string, db: D1DatabaseSession) {
	if (operation === 'init') {
		const initdb = [];
		const sql = [
			'CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT NOT NULL UNIQUE, apikey TEXT NOT NULL UNIQUE, options TEXT, last_used INTEGER NOT NULL)',
			'CREATE TABLE meta (key TEXT PRIMARY KEY, data BLOB NOT NULL)',
            'INSERT INTO meta (key, data) VALUES ("Version", 1)'
		];
		for (const op of sql) {
			initdb.push(db.prepare(op));
		}
		await db.batch(initdb);
	}
}
