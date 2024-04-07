import { dlopen, FFIType, suffix, ptr, read, CString, Pointer } from "bun:ffi";

// pacman -Ql chromaprint
const path = `libchromaprint.${suffix}`

// https://github.com/acoustid/chromaprint/blob/master/src/chromaprint.h

enum ChromaprintAlgorithm {
	CHROMAPRINT_ALGORITHM_TEST1 = 0,
	CHROMAPRINT_ALGORITHM_TEST2,
	CHROMAPRINT_ALGORITHM_TEST3,
	CHROMAPRINT_ALGORITHM_TEST4,
	CHROMAPRINT_ALGORITHM_TEST5,
	CHROMAPRINT_ALGORITHM_DEFAULT = CHROMAPRINT_ALGORITHM_TEST2,
};

const lib = dlopen(path, {
	// CHROMAPRINT_API int chromaprint_encode_fingerprint(const uint32_t *fp, int size, int algorithm, char **encoded_fp, int *encoded_size, int base64);
	chromaprint_encode_fingerprint: {
		args: [FFIType.uint32_t, FFIType.int, FFIType.int, FFIType.pointer, FFIType.pointer, FFIType.int],
		returns: FFIType.int,
	},
	// CHROMAPRINT_API int chromaprint_decode_fingerprint(const char *encoded_fp, int encoded_size, uint32_t **fp, int *size, int *algorithm, int base64);
	chromaprint_decode_fingerprint: {
		args: [FFIType.pointer, FFIType.int, FFIType.pointer, FFIType.pointer, FFIType.pointer, FFIType.int],
		returns: FFIType.int,
	},
	// CHROMAPRINT_API void chromaprint_dealloc(void *ptr);
	chromaprint_dealloc: {
		args: [FFIType.pointer],
		returns: FFIType.void,
	},
})

export function chromaprint_encode_raw(buffer: Uint32Array): String {
	// &size_ptr and &buf_ptr
	// i have no idea if the GC can track these pointers even if they're borrowed over the FFI boundary
	const size_ptr = ptr(Buffer.allocUnsafe(4)) // int
	const buf_ptr = ptr(Buffer.allocUnsafe(8)) // char *

	const ret = lib.symbols.chromaprint_encode_fingerprint(ptr(buffer), buffer.length, ChromaprintAlgorithm.CHROMAPRINT_ALGORITHM_DEFAULT, buf_ptr, size_ptr, 1)
	if (ret === 0) {
		throw new Error(`chromaprint_encode_fingerprint failed: ${ret}`)
	}

	const size = read.i32(size_ptr)
	const buf = read.ptr(buf_ptr) as Pointer

	console.log(size, buf)

	const str = new CString(buf, size)

	lib.symbols.chromaprint_dealloc(buf) // lucky me

	return str
}
