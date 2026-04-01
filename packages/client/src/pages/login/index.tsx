import { useAuthStore, useConfigStore } from "@buildingai/stores";
import SvgIcons from "@buildingai/ui/components/svg-icons";
import { Navigate, useSearchParams } from "react-router-dom";

import { LoginForm } from "./_components/login-form";

const LoginPage = () => {
  const [searchParams] = useSearchParams();
  const { isLogin } = useAuthStore((state) => state.authActions);
  const { websiteConfig } = useConfigStore((state) => state.config);
  const redirect = searchParams.get("redirect") ?? "";

  if (isLogin()) {
    const target = redirect || "/console/dashboard";
    if (target.startsWith("http")) {
      const url = new URL(target);
      if (url.port && url.pathname.includes("/extension/")) {
        const token = useAuthStore.getState().auth.token;
        if (token) {
          url.searchParams.set("_t", btoa(token));
        }
      }
      window.location.replace(url.toString());
      return null;
    }
    return <Navigate to={target} replace />;
  }
  return (
    <div className="bg-muted flex min-h-svh flex-col items-center justify-center gap-6 p-6 md:p-10">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <a href="#" className="flex items-center gap-2 self-center font-medium">
          {websiteConfig?.webinfo.logo ? (
            <div className="flex items-center gap-2">
              <img className="h-8" src={websiteConfig?.webinfo.logo} alt="logo" />
              <span className="text-xl font-bold">{websiteConfig?.webinfo.name}</span>
            </div>
          ) : (
            <SvgIcons.buildingaiFull className="h-8" />
          )}
        </a>
        <LoginForm />
      </div>
    </div>
  );
};

export { LoginPage };
