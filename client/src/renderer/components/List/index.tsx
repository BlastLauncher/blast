import { Item } from "./Item";

export type ListProps = {
  children: React.ReactNode;
};

export const List = (props: ListProps) => {
  return <div>{props.children}</div>;
};

List.Item = Item;
