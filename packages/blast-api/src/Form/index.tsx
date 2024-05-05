import { ElementTypes } from "@blastlauncher/renderer/src";
import { createDebug } from "@blastlauncher/utils/src";
import { Form as RForm } from "raycast-original";
import { FunctionComponent, createContext, useCallback, useContext, useState } from "react";

import { TextField } from "./TextField";

const debug = createDebug("blast:form");

type FormPropKeys = (keyof RForm.Props)[];
const serializedKeys: FormPropKeys = ["enableDrafts", "isLoading", "navigationTitle"];

export const FormContext = createContext<{
  updateValue: (id: string, value: string) => void;
  formValues: Record<string, string>;
}>({
  updateValue: () => {
    /* noop */
  },
  formValues: {},
});

export const useFormContext = () => {
  return useContext(FormContext);
};

export const Form: FunctionComponent<RForm.Props> = (props: RForm.Props) => {
  const { actions, children, ...rest } = props;
  const [formValues, setFormValues] = useState<Record<string, string>>({});

  const updateValue = useCallback((id: string, value: string) => {
    debug("updating form value", id, value);

    setFormValues((prev) => ({
      ...prev,
      [id]: value,
    }));
  }, []);

  return (
    <FormContext.Provider
      value={{
        updateValue,
        formValues,
      }}
    >
      <ElementTypes.Form {...rest} serializedKeys={serializedKeys}>
        {actions}

        {children}
      </ElementTypes.Form>
    </FormContext.Provider>
  );
};

(Form as any).TextField = TextField;
