import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";

import type { TokenStorage } from "./lib/identity";

// identityToken keeps the install's identity token (ADR-0009) across launches.
// Like apiUrl.ts it lives outside lib/ because it needs native modules; the
// identity logic itself is the framework-free lib/identity. The token is a
// credential, so native builds keep it in the Keychain/Keystore via
// expo-secure-store; that has no web implementation, so web uses localStorage.

const KEY = "identity-token";

export const identityToken: TokenStorage =
  Platform.OS === "web"
    ? {
        get: async () => globalThis.localStorage?.getItem(KEY) ?? null,
        set: async (token) => globalThis.localStorage?.setItem(KEY, token),
        remove: async () => globalThis.localStorage?.removeItem(KEY),
      }
    : {
        get: () => SecureStore.getItemAsync(KEY),
        set: (token) => SecureStore.setItemAsync(KEY, token),
        remove: () => SecureStore.deleteItemAsync(KEY),
      };
