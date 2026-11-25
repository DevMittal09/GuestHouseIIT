import { cache } from "react";
import { getStore } from "./store";
import type { OnBehalfEntry } from "./store/types";

export const getOnBehalfConfig = cache(async (): Promise<OnBehalfEntry[]> => {
  try {
    return await getStore().listOnBehalfConfig();
  } catch {
    return [];
  }
});

export const getOnBehalfTargetIds = cache(
  async (bookerProfileId: string): Promise<string[]> => {
    try {
      return await getStore().onBehalfTargetIds(bookerProfileId);
    } catch {
      return [];
    }
  },
);
