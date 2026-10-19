import * as cheerio from "cheerio";

export default function Command() {
  console.log(cheerio.load("<h1>Bundled HTML</h1>")("h1").text());
  // Keep the full namespace live, including the API that imports undici.
  console.log(typeof cheerio.fromURL);
}
