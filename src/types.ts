import { EventTransportMessagePayload } from 'rempl';

type ConnectMessage = { type: 'connect' };
type DisconnectMessage = { type: 'disconnect' };
type PageConnectMessage = { type: 'page:connect'; data: [session: string, publishers: string[]] };
type RemplMessage = EventTransportMessagePayload;

export type PluginToPageMessage = RemplMessage;
export type PageToPluginMessage = PageConnectMessage | RemplMessage;
export type BgToPluginMessage = ConnectMessage | DisconnectMessage | PageToPluginMessage;
export type BgToPageMessage = ConnectMessage | DisconnectMessage | PluginToPageMessage;

export type MessageListenerMap<U extends { type: string }> = {
    [K in U['type']]?: U extends { type: K }
        ? U extends { data: any }
            ? (...args: U['data']) => void
            : () => void
        : never;
};

export type MessageArgsMap<U extends { type: string }> = {
    [K in U['type']]: U extends { type: K }
        ? U extends { data: any }
            ? U['data'] | [...U['data'], (...args: unknown[]) => void]
            : []
        : never;
};
