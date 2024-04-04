#include <sqlite3ext.h>
SQLITE_EXTENSION_INIT1
#include <math.h>
#include <stddef.h>
#include <stdint.h>

// no stdbit :(
// #include <stdbit.h>

#define popcnt(x) __builtin_popcount(x)

static void hdist32(sqlite3_context *ctx, int argc, sqlite3_value **argv) {
	uint32_t a = sqlite3_value_int(argv[0]);
	uint32_t b = sqlite3_value_int(argv[1]);

	uint32_t hdist = popcnt(a ^ b);
	sqlite3_result_int(ctx, hdist);
}

#ifdef _WIN32
__declspec(dllexport)
#endif
int sqlite3_hdist_init(sqlite3 *db, char **pz_err_msg, const sqlite3_api_routines *p_api) {
	SQLITE_EXTENSION_INIT2(p_api)
	sqlite3_create_function(db, "hdist32", 2, SQLITE_UTF8 | SQLITE_DETERMINISTIC | SQLITE_INNOCUOUS, NULL, hdist32, NULL, NULL);
	return SQLITE_OK;
}
