/** "Start game" target (contract with the host page, see TASKS.md wave 2 coordination). */
export const hostUrl = (quizId: string) => `/host/new?quizId=${encodeURIComponent(quizId)}`;
