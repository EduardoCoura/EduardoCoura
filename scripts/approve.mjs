import { approve } from "./testimonial.mjs";

await approve({ login: process.env.AUTHOR, body: process.env.BODY, issue: process.env.ISSUE });
