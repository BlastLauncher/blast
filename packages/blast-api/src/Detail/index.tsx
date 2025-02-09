import { ElementTypes } from "@blastlauncher/renderer/src";
import type { Detail as RDetail } from "raycast-original";

type DetailPropKeys = (keyof RDetail.Props)[];
const serializedKeys: DetailPropKeys = ["isLoading", "markdown", "navigationTitle"];

export const Detail = (props: RDetail.Props) => {
  const { metadata, ...rest } = props;
  return (
    <>
      <ElementTypes.Detail serializedKeys={serializedKeys} {...rest} />
      {metadata}
    </>
  );
};
