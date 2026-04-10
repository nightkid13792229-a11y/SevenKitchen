import { BadRequestException } from '@nestjs/common';

export function resolveDogAvatarUploadErrorMessage(
  error: unknown,
  fallback: string = 'Failed to upload avatar',
) {
  if (error instanceof BadRequestException) {
    const response = error.getResponse();
    if (typeof response === 'string' && response.trim()) {
      return response;
    }

    if (
      response &&
      typeof response === 'object' &&
      'message' in response &&
      typeof (response as { message?: unknown }).message === 'string' &&
      (response as { message: string }).message.trim()
    ) {
      return (response as { message: string }).message;
    }
  }

  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  return fallback;
}
