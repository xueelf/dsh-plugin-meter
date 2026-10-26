import { en } from './en';
import { zh } from './zh';

export type Translate = (key: string) => string;

export const METER_LOCALE = { en, zh };
