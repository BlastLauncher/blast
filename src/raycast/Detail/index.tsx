import React from "react";
import { Detail as RDetail } from "raycast-original";
import * as ElementTypes from "../../elements/types";

export const Detail = (props: RDetail.Props) => {
  return <ElementTypes.Detail serializesKeys={["markdown"]} {...props} />;
};
