import { ObjectFromList } from "../../lib/typeUtils";
import { BlastComponent } from "../../types";
import { useNavigationContext } from "../Navigation/context";

const serializedKeys = ["enableDrafts", "isLoading", "navigationTitle"];

export type FormProps = ObjectFromList<typeof serializedKeys>;

export const Form = ({ children, props }: { children: BlastComponent[]; props: FormProps }): JSX.Element => {
  const { pop, canPop } = useNavigationContext();

  return (
    <div className="h-full py-2">
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

      <div cmdk-raycast-footer=""></div>
    </div>
  );
};
