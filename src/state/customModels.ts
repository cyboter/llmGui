export interface CustomModel {
  path: string;
  fileName: string;
  sizeBytes: number;
  addedAt: number;
}

const CUSTOM_MODELS_KEY = "llmgui.customModels";

export function loadCustomModels(): CustomModel[] {
  const raw = localStorage.getItem(CUSTOM_MODELS_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as CustomModel[];
  } catch {
    return [];
  }
}

export function saveCustomModels(models: CustomModel[]): void {
  localStorage.setItem(CUSTOM_MODELS_KEY, JSON.stringify(models));
}

export function addCustomModel(model: CustomModel): CustomModel[] {
  const existing = loadCustomModels().filter((m) => m.path !== model.path);
  const updated = [model, ...existing];
  saveCustomModels(updated);
  return updated;
}

export function removeCustomModel(path: string): CustomModel[] {
  const updated = loadCustomModels().filter((m) => m.path !== path);
  saveCustomModels(updated);
  return updated;
}
