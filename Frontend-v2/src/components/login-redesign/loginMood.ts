"use client";

import { createContext, useContext } from "react";

/**
 * Moments in the sign-in form the scene around the card reacts to (LoginPage): "oops" when something
 * entered is wrong (the fruit friends shiver), "cheer" when a code is on its way (they hop).
 */
export type LoginMood = "oops" | "cheer";

export const LoginMoodContext = createContext<(mood: LoginMood) => void>(() => {});

/** Tell the scene around the card how the form is going. Does nothing outside LoginPage. */
export const useLoginMood = () => useContext(LoginMoodContext);
