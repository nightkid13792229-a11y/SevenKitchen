type ValidatableForm = {
  validate: () => Promise<boolean>;
} | null | undefined;

export async function validateElementForm(
  form: ValidatableForm,
): Promise<boolean> {
  if (!form) {
    return false;
  }

  try {
    return Boolean(await form.validate());
  } catch {
    return false;
  }
}
