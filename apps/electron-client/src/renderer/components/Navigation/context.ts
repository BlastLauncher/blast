import { createContext, useContext } from "react";

export const NavigationContext = createContext<{
  pop: () => void;
  canPop: boolean;
}>({
  pop: () => {
    /* noop */
  },
  canPop: false,
});

export const useNavigationContext = () => {
  return useContext(NavigationContext);
};
