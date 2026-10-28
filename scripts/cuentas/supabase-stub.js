/* eslint-env browser */
const sesion = () => {
  const t = localStorage.getItem("harness_token");
  return t ? { access_token: t, user: { id: "u-harness" } } : null;
};
export const supabase = {
  auth: {
    getSession: async () => ({ data: { session: sesion() } }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    signOut: async () => { localStorage.removeItem("harness_token"); },
    signInWithPassword: async () => ({ error: new Error("harness") }),
    signInWithOAuth: async () => ({ error: new Error("harness") }),
  },
};
