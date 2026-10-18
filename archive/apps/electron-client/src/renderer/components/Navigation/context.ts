import { createContext, useContext } from "react";

export const NavigationContext = createContext<{
  pop: () => void;
  softPop: () => void;
  canPop: boolean;
}>({
  pop: () => {
    /* noop */
  },
  softPop: () => {
    /* noop */
  },
  canPop: false,
});

export const useNavigationContext = () => {
  return useContext(NavigationContext);
};
