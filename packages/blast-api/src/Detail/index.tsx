import { Detail as RDetail } from "raycast-original";

import { ElementTypes } from "@blastlauncher/renderer/src";

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
