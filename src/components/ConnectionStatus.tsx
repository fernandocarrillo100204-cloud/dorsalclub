import React, { useEffect, useState } from "react";
import { WifiOff } from "lucide-react";

/** No ocupa espacio mientras hay conexión. */
export default function ConnectionStatus() {
  const [offline, setOffline] = useState(() => typeof navigator !== "undefined" && navigator.onLine === false);
  useEffect(() => {
    const update = () => setOffline(navigator.onLine === false);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  return offline ? <div className="connection-banner" role="status"><WifiOff className="h-4 w-4 shrink-0" />Sin conexión. Revisa tu conexión antes de registrar operaciones.</div> : null;
}
