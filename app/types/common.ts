export type MessageT = {
    role: string;
    content: string;
}
export type ProcessTextFuncT = string | Promise<string>