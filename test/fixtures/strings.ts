import value from "helo";
export { value };
export const message = "he\u006co";
export const greeting = `helo ${message}`;
export const data = { "helo": "hello" };
export const pattern = /helo/;
export const tagged = String.raw`helo`;
export type Imported = import("helo").Value;
