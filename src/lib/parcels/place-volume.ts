/**
 * ТЗ docx 28.10.26: «Параметри відправлення» у формі Працівника (створення і
 * редагування посилки). Віконця «Об'ємна вага» і «Або об'єм» пов'язані:
 *  - ввели об'ємну вагу → об'єм = вага ÷ 250;
 *  - ввели об'єм → об'ємна вага = об'єм × 250 (стандартний алгоритм);
 *  - ввели Д×Ш×В → обидва віконця показують розраховане з розмірів і лише
 *    для читання (береться саме ця об'ємна вага).
 * «Загальні параметри» цього не стосуються.
 */
import {
  calculateVolume,
  calculateVolumetricWeight,
  volumeFromVolumetricWeight,
  volumetricWeightFromVolume,
} from '@/lib/utils/volumetric';

export interface PlaceVolumeDraft {
  length: string;
  width: string;
  height: string;
  volume: string;
  /** Об'ємна вага (кг), введена напряму або розрахована з об'єму. */
  volWeight: string;
}

/** Число → рядок для віконця: без хвостових нулів, порожньо для 0. */
function toField(n: number, decimals: number): string {
  if (!Number.isFinite(n) || n <= 0) return '';
  const rounded = Number(n.toFixed(decimals));
  return rounded > 0 ? String(rounded) : '';
}

export function placeHasDims(p: PlaceVolumeDraft): boolean {
  return Number(p.length) > 0 && Number(p.width) > 0 && Number(p.height) > 0;
}

/** Об'ємна вага місця для живого підсумку (той самий пріоритет, що на сервері). */
export function draftVolumetricWeight(p: PlaceVolumeDraft): number {
  if (placeHasDims(p)) {
    return Number(calculateVolumetricWeight(Number(p.length), Number(p.width), Number(p.height)).toFixed(2));
  }
  const direct = Number(p.volWeight) || 0;
  if (direct > 0) return direct;
  return volumetricWeightFromVolume(Number(p.volume) || 0);
}

/** Що показати у віконцях: при Д×Ш×В — розраховане з розмірів. */
export function draftVolumeFields(p: PlaceVolumeDraft): { volWeight: string; volume: string; fromDims: boolean } {
  if (placeHasDims(p)) {
    const l = Number(p.length), w = Number(p.width), h = Number(p.height);
    return {
      volWeight: toField(calculateVolumetricWeight(l, w, h), 2),
      volume: toField(calculateVolume(l, w, h), 4),
      fromDims: true,
    };
  }
  return { volWeight: p.volWeight, volume: p.volume, fromDims: false };
}

/** Введення у віконце «Об'ємна вага» → об'єм = вага ÷ 250. */
export function patchFromVolWeight(value: string): Pick<PlaceVolumeDraft, 'volWeight' | 'volume'> {
  // 4 знаки — точність колонки parcel_places.volume.
  return { volWeight: value, volume: toField(volumeFromVolumetricWeight(Number(value) || 0), 4) };
}

/** Введення у віконце «Або об'єм» → об'ємна вага = об'єм × 250. */
export function patchFromVolume(value: string): Pick<PlaceVolumeDraft, 'volWeight' | 'volume'> {
  return { volume: value, volWeight: toField(volumetricWeightFromVolume(Number(value) || 0), 3) };
}

/** Чи вказано хоч одне джерело об'ємної ваги (вона не може бути нульовою, ТЗ 13.06.26). */
export function placeHasVolumeSource(p: PlaceVolumeDraft): boolean {
  return placeHasDims(p) || Number(p.volume) > 0 || Number(p.volWeight) > 0;
}

/**
 * Поля об'єму для API. При Д×Ш×В не шлемо нічого — сервер рахує з розмірів
 * (старе значення з віконець не має потрапити в БД поруч із розмірами).
 */
export function draftVolumePayload(p: PlaceVolumeDraft): { volume?: number; volumetricWeight?: number } {
  if (placeHasDims(p)) return {};
  return {
    volume: Number(p.volume) || undefined,
    volumetricWeight: Number(p.volWeight) || undefined,
  };
}
