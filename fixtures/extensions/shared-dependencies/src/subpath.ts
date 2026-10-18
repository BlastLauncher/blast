import get from "lodash/get";

export default function Command() {
  console.log(get({ shared: { value: "subpath works" } }, "shared.value"));
}
