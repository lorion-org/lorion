import { defineCapability } from '@lorion-org/react';
import manifest from '../capability.json';

export const capability = defineCapability({
  id: 'admin',
  manifest,
});
