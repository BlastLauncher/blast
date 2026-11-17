import { useEffect, useState } from "react";
import { List } from "@raycast/api";
import https from "https";
import http from "http";
import nodeFetch from "node-fetch";
import axios from "axios";

export default function Command({ arguments: args }: { arguments: { target?: string } }) {
  const [rows, setRows] = useState<string[]>([]);
  useEffect(() => {
    const target = args.target ?? "https://no-cors.example.test/data.json";
    const add = (value: string) => setRows((previous) => [...previous, value]);
    fetch(
      new Request(target, {
        method: "POST",
        body: "fetch-body",
        headers: { "x-test": "fetch-header" },
      }),
    )
      .then((response) => response.json())
      .then((data) => add(`fetch ${data.message}`))
      .catch(() => add("fetch blocked"));
    nodeFetch(target, {
      headers: { "x-test": "node-fetch-header" },
    })
      .then((response) => add(`node-fetch status ${response.status}`))
      .catch(() => add("node-fetch blocked"));
    for (const adapter of ["xhr", "fetch"]) {
      const client = `axios-${adapter}`;
      axios
        .post(target, `${client}-body`, { adapter, headers: { "x-test": `${client}-header` } })
        .then((response) => add(`${client} ${response.data.message}`))
        .catch(() => add(`${client} blocked`));
    }
    const xhr = new XMLHttpRequest();
    xhr.open("POST", target);
    xhr.withCredentials = true;
    xhr.setRequestHeader("x-test", "xhr-header");
    xhr.addEventListener("load", () => add(`xhr ${JSON.parse(xhr.responseText).message}`));
    xhr.addEventListener("error", () => add("xhr blocked"));
    xhr.send("xhr-body");
    const request = (target.startsWith("http:") ? http : https).request(
      target,
      { method: "POST", headers: { "x-test": "https-header" } },
      (response) => {
        let text = "";
        response.on("data", (chunk) => {
          text += chunk.toString();
        });
        response.on("end", () => add(`https ${JSON.parse(text).message}`));
      },
    );
    request.on("error", () => add("https blocked"));
    request.end("https-body");
  }, []);
  return (
    <List>
      {rows.map((row) => (
        <List.Item key={row} title={row} />
      ))}
    </List>
  );
}
