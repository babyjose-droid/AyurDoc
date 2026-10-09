import type { FastifyInstance } from 'fastify';
export declare const DOSHA_QUESTIONS: {
    no: number;
    category: string;
    question: string;
    options: {
        label: string;
        vata: number;
        pitta: number;
        kapha: number;
    }[];
}[];
export declare function calculateDoshaScores(answers: {
    questionId: number;
    optionIndex: number;
}[]): {
    vata: number;
    pitta: number;
    kapha: number;
    dominantDosha: string;
};
export default function doshaRoutes(fastify: FastifyInstance): Promise<void>;
//# sourceMappingURL=dosha.d.ts.map