type Props = {
  title: string;
  description: string;
  icon: string;
};

export const EmptyView = (props: Props): JSX.Element => {
  return (
    <>
      {props.icon && <span className="text-5xl">{props.icon}</span>}

      <span className="text-2xl">{props.title}</span>
      <span className="text-xl">{props.description}</span>
    </>
  );
};

export default EmptyView;
