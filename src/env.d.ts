/// <reference types="vite/client" />

interface ImportMetaEnv {
	readonly VITE_SVWS_BASE_URL?: string
	readonly VITE_SVWS_PROTOCOL?: string
	readonly VITE_SVWS_SCHEMA?: string
	readonly VITE_SVWS_USERNAME?: string
	readonly VITE_SVWS_PASSWORD?: string

	readonly SVWSSERVER_PROTOCOL?: string
	readonly SVWSSERVER_HOST?: string
	readonly SVWSSERVER_PORT?: string
	readonly SVWSSERVER_SCHEMA?: string
	readonly SVWSSERVER_USER?: string
	readonly SVWSSERVER_PASSWORD?: string
}
