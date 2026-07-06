export const DOMAIN = "notesnook-inbox.youwereneverhere.fyi" // domain emails are received on.
export const ATTACHMENT_SIZE_LIMIT = 5 * 1024 * 1024 * 1.4; // 5 MiB // the multiplication by 1.4 is to prevent attachments that are base64-ified from becoming "too large".
export const NOTE_SIZE_LIMIT = 8_000_000; // 8 MB
export const INACTIVE_USER_TIMEOUT = 86400000 * 30; // 30 days.