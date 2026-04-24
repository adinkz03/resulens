export const getToken = (): string | null => {
  return localStorage.getItem("token");
};

export const setToken = (token: string) => {
  localStorage.setItem("token", token);
};

export const removeToken = () => {
  localStorage.removeItem("token");
};

export const getAuthHeaders = (): Record<string, string> => {
  const token = getToken();

  return token
    ? { Authorization: `Bearer ${token}` }
    : {};
};
