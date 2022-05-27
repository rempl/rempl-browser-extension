import { EventTransportChannelId, EventTransportMessagePayload } from 'rempl';

export type PublisherInfo = {
    id: string;
    channelId: EventTransportChannelId;
    name: string;
};

type ConnectMessage = { type: 'connect' };
type DisconnectMessage = { type: 'disconnect' };
type PageConnectMessage = {
    type: 'page:connect';
    data: [session: string, publishers: PublisherInfo[]];
};
type PagePublishersMessage = {
    type: 'page:publishers';
    data: [publishers: PublisherInfo[]];
};
type PluginSubscribers = {
    type: 'plugin:subscribers';
    data: [subscribers: PublisherInfo[]];
};
type RemplMessage = {
    type: 'rempl';
    data: [channelId: EventTransportChannelId, payload: EventTransportMessagePayload];
};

export type PageToPluginMessage = PageConnectMessage | PagePublishersMessage | RemplMessage;
export type PluginToPageMessage = PluginSubscribers | RemplMessage;
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
    [K in U['type']]: U extends { type: K } ? (U extends { data: any } ? U['data'] : []) : never;
};

export type MessageArgsWithCallbackMap<U extends { type: string }> = {
    [K in U['type']]: U extends { type: K }
        ? U extends { data: any }
            ? U['data'] | [...U['data'], (...args: unknown[]) => void]
            : []
        : never;
};
