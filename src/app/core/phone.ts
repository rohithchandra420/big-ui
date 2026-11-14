/**
 * A phone number as people type it: 7 to 15 digits, a leading + allowed, with
 * spaces, dashes, dots or brackets in between. The server stores it without
 * them (big-api User.cleanPhone) and checks it again.
 */
export const PHONE_PATTERN = /^\s*\+?(?:[\s\-().]*\d){7,15}[\s\-().]*$/;
