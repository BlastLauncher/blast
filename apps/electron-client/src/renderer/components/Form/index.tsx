import { ObjectFromList } from "../../lib/typeUtils";
import { useRemoteBlastTree } from "../../store";
import { BlastComponent } from "../../types";
import { useDefaultAction } from "../List/hooks";
import { RaycastDarkIcon } from "../List/RaycastDarkIcon";
import { SubCommand } from "../List/SubCommand";
import { useNavigationContext } from "../Navigation/context";

const serializedKeys = ["enableDrafts", "isLoading", "navigationTitle"];

export type FormProps = ObjectFromList<typeof serializedKeys>;

const textFieldSerializedKeys = [
  "autoFocus",
  "defaultValue",
  "error",
  "id",
  "info",
  "placeholder",
  "storeValue",
  "title",
  "value",
  "onChangeEventName",
];
export type TextFieldProps = ObjectFromList<typeof textFieldSerializedKeys>;

const TextField = ({ props }: { props: TextFieldProps }) => {
  const { ws } = useRemoteBlastTree();

  return (
    <div className="flex items-center w-full gap-6">
      <label className="text-gray-400" htmlFor={props.id}>
        {props.title}
      </label>

      <input
        className="flex-1 py-0.5 bg-transparent border border-solid rounded-md border-slate-600 px-1.5 focus:outline-none focus:border-white"
        type="text"
        id={props.id}
        onChange={(e) => {
          ws.call(props.onChangeEventName, {
            value: e.target.value,
          });
        }}
        value={props.value}
      />
    </div>
  );
};

const renderFormComponent = (child: BlastComponent) => {
  switch (child.elementType) {
    case "TextField":
      return <TextField props={child.props} />;
    default:
      return null;
  }
};

const FormFooter = ({ actionData }: { actionData: BlastComponent }) => {
  const { ws } = useRemoteBlastTree();

  const action = useDefaultAction(actionData);

  return (
    <div cmdk-raycast-footer="">
      <RaycastDarkIcon />

      {action && (
        <button
          cmdk-raycast-open-trigger=""
          onClick={() => {
            ws.call(action.props.actionEventName);
          }}
        >
          {action.props.title}
          <kbd>↵</kbd>
        </button>
      )}

      <hr />

      <SubCommand actionData={actionData} />
    </div>
  );
};

export const Form = ({ children, props }: { children: BlastComponent[]; props: FormProps }): JSX.Element => {
  const { pop, canPop } = useNavigationContext();

  const nonActionChildren = children.filter((child) => child.elementType !== "ActionPanel");

  return (
    <div className="h-full py-2" cmdk-root="">
      <div className="absolute top-0 left-0 w-full h-2 drag-area" />

      {/* navigation header */}
      <div className="flex items-center w-full h-12 px-3 border-b border-solid border-slate-600">
        {/* pop, left arrow button */}

        {canPop && (
          <button className="w-4 h-4 p-1 text-white rounded bg-slate-500" onClick={pop}>
            <svg
              className="w-full h-full"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
              fill="currentColor"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
          </button>
        )}
      </div>

      <div className="flex flex-col gap-2 px-4 max-w-[60%] justify-center items-center mx-auto py-4 text-white">
        {
          // form content
          nonActionChildren.map((child) => renderFormComponent(child))
        }
      </div>

      {/* footer */}
      <FormFooter actionData={children.find((child) => child.elementType === "ActionPanel")} />
    </div>
  );
};
