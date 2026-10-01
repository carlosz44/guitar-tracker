import { type SettingsErrorKey, settingsErrors } from "@ds/shared";

export const es = {
  app: {
    name: "Daily Shed",
    tagline: "Tu práctica diaria de guitarra: clases, temas y tiempo de estudio en un solo lugar.",
  },
  common: {
    loading: "Cargando…",
    retry: "Reintentar",
    genericError: "Algo salió mal. Inténtalo de nuevo.",
  },
  nav: {
    label: "Navegación principal",
    today: "Hoy",
    lessons: "Clases",
    topics: "Temas",
    history: "Historial",
    settings: "Ajustes",
  },
  login: {
    signIn: "Entrar con GitHub",
    redirecting: "Abriendo GitHub…",
    error: "No se pudo iniciar sesión. Inténtalo de nuevo.",
  },
  accessDenied: {
    title: "Acceso denegado",
    body: "Esta cuenta de GitHub no tiene acceso a Daily Shed. Si es un error, entra con la cuenta correcta.",
    back: "Volver",
  },
  notFound: {
    title: "Página no encontrada",
    body: "Esta página no existe.",
    back: "Ir a Hoy",
  },
  today: {
    title: "Hoy",
    empty: "Aquí verás tu práctica de hoy",
  },
  lessons: {
    title: "Clases",
    placeholder: "Aquí verás tus clases y los archivos del profe.",
  },
  topics: {
    title: "Temas",
    placeholder: "Aquí verás los temas que estás practicando.",
  },
  history: {
    title: "Historial",
    placeholder: "Aquí verás tus sesiones de práctica.",
  },
  settings: {
    title: "Ajustes",
    account: "Cuenta",
    accountDescription: "Conectada con GitHub",
    practice: "Práctica",
    timezone: "Zona horaria",
    dailyTarget: "Meta diaria (minutos)",
    dailyTargetHelp: "Entre 10 y 240 minutos, en pasos de 5.",
    save: "Guardar",
    saving: "Guardando…",
    saved: "Meta diaria guardada",
    saveError: "No se pudo guardar la meta. Inténtalo de nuevo.",
    backups: "Respaldos",
    lastBackup: "Último respaldo",
    noBackups: "Sin respaldos todavía",
    signOut: "Cerrar sesión",
  },
  validation: {
    [settingsErrors.dailyTargetInvalid]: "Ingresa la meta en minutos.",
    [settingsErrors.dailyTargetRange]: "La meta debe estar entre 10 y 240 minutos.",
    [settingsErrors.dailyTargetStep]: "Usa pasos de 5 minutos, por ejemplo 30, 35 o 40.",
  } satisfies Record<SettingsErrorKey, string>,
  pwa: {
    updateAvailable: "Nueva versión disponible",
    update: "Actualizar",
  },
} as const;

export function validationMessage(key: string | undefined): string {
  if (key && key in es.validation) return es.validation[key as SettingsErrorKey];
  return es.common.genericError;
}
