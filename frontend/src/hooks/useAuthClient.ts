import { AuthClientContext } from "../context/authclient"
import { useContext } from "react"

const useAuthClient = () => {
    const context = useContext(AuthClientContext);

    if (!context) {
        throw new Error("useAuthClient must be used within an AuthClientProvider");
    }

    return context;
}

export default useAuthClient;