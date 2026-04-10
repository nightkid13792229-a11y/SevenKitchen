import { BadRequestException } from '@nestjs/common';
import { resolveDogAvatarUploadErrorMessage } from 'src/interfaces/controllers/dog-avatar-error';

describe('resolveDogAvatarUploadErrorMessage', () => {
  it('preserves explicit bad request messages from the upload stack', () => {
    expect(
      resolveDogAvatarUploadErrorMessage(
        new BadRequestException('COS credentials not configured'),
      ),
    ).toBe('COS credentials not configured');
  });

  it('falls back to the provided generic message when nothing useful is available', () => {
    expect(resolveDogAvatarUploadErrorMessage(undefined)).toBe(
      'Failed to upload avatar',
    );
  });
});
