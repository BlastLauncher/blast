import { Detail as RDetail } from "raycast-original";
import * as ElementTypes from "../../elements/types";

type DetailPropKeys = (keyof RDetail.Props)[];
const serializesKeys: DetailPropKeys = ["isLoading", "markdown", "navigationTitle"];

export const Detail = (props: RDetail.Props) => {
  const { metadata, ...rest } = props;
  return (
    <>
      <ElementTypes.Detail serializesKeys={serializesKeys} {...rest} />
      {metadata}
    </>
  );
};
