import first from "blast-unavailable/subpath";
import second from "@blast-missing/scoped/subpath";
import duplicate from "blast-unavailable/other";

export default function Command() {
  return first(second(duplicate));
}
