import { FileText, BarChart3, Building2, Shield, Target, Star } from "lucide-react";
import { PR_GREEN } from "./constants";

export function FloatingIcons() {
  return (
    <>
      <div className="hidden lg:block fixed left-6 top-1/4 z-0 opacity-[0.07]">
        <FileText className="w-10 h-10 mb-12 animate-float" style={{ color: PR_GREEN }} />
        <BarChart3 className="w-8 h-8 mb-14 animate-float-delayed" style={{ color: PR_GREEN }} />
        <Building2 className="w-9 h-9 animate-float-slow" style={{ color: PR_GREEN }} />
      </div>
      <div className="hidden lg:block fixed right-6 top-1/3 z-0 opacity-[0.07]">
        <Shield className="w-10 h-10 mb-12 animate-float-delayed" style={{ color: PR_GREEN }} />
        <Target className="w-8 h-8 mb-14 animate-float" style={{ color: PR_GREEN }} />
        <Star className="w-9 h-9 animate-float-slow" style={{ color: PR_GREEN }} />
      </div>
    </>
  );
}
