import get from "lodash/get";
import { format } from "date-fns/format";

export default function Command() {
  console.log(format(new Date(2026, 0, 2), "yyyy-MM-dd"));
  console.log(get({ shared: { value: "subpath works" } }, "shared.value"));
}
