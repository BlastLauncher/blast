import { Form as RForm } from "raycast-original";

import * as ElementTypes from "../../elements/types";

import { TextField } from "./TextField";

export const Form = (props: RForm.Props) => {
  return <ElementTypes.Form {...props} />;
};

Form.TextField = TextField;
