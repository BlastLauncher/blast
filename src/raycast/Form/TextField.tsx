import { Form } from "raycast-original";

import * as ElementTypes from "../../elements/types";

export const TextField = (props: Form.TextField.Props) => {
  return <ElementTypes.TextField {...props} />;
};
