import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
    console.log("Middleware: updateSession started (BYPASS MODE)");
    console.log("Middleware: URL", request.nextUrl.pathname);

    // TEMPORARY BYPASS FOR DEBUGGING
    return { response: NextResponse.next(), user: null }

    /* 
    try {
        let supabaseResponse = NextResponse.next({
            request,
        })
        // ... (rest of logic commented out)
    } catch (e) {
        console.error("Middleware: CRITICAL ERROR", e);
        return { response: NextResponse.next(), user: null };
    }
    */
}
