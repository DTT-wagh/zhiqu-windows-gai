import jdk.internal.org.objectweb.asm.ClassReader;
import jdk.internal.org.objectweb.asm.ClassVisitor;
import jdk.internal.org.objectweb.asm.ClassWriter;
import jdk.internal.org.objectweb.asm.MethodVisitor;
import jdk.internal.org.objectweb.asm.Opcodes;

import java.nio.file.Files;
import java.nio.file.Path;

public final class PatchMagicGameService {
    private static final String TARGET_METHOD = "imageUrl";
    private static final String TARGET_DESCRIPTOR = "(Ljava/lang/String;Ljava/util/List;)Ljava/lang/String;";

    private PatchMagicGameService() {
    }

    public static void main(String[] args) throws Exception {
        if (args.length != 2) {
            throw new IllegalArgumentException("Usage: PatchMagicGameService <input.class> <output.class>");
        }

        ClassReader reader = new ClassReader(Files.readAllBytes(Path.of(args[0])));
        ClassWriter writer = new ClassWriter(reader, ClassWriter.COMPUTE_MAXS | ClassWriter.COMPUTE_FRAMES);
        ClassVisitor visitor = new ClassVisitor(Opcodes.ASM7, writer) {
            private boolean found;

            @Override
            public MethodVisitor visitMethod(
                    int access,
                    String name,
                    String descriptor,
                    String signature,
                    String[] exceptions
            ) {
                if (TARGET_METHOD.equals(name) && TARGET_DESCRIPTOR.equals(descriptor)) {
                    found = true;
                    return null;
                }
                return super.visitMethod(access, name, descriptor, signature, exceptions);
            }

            @Override
            public void visitEnd() {
                if (!found) {
                    throw new IllegalStateException("MagicGameService.imageUrl method was not found");
                }
                MethodVisitor method = super.visitMethod(
                        Opcodes.ACC_PRIVATE,
                        TARGET_METHOD,
                        TARGET_DESCRIPTOR,
                        "(Ljava/lang/String;Ljava/util/List<Ljava/lang/String;>;)Ljava/lang/String;",
                        null
                );
                method.visitCode();
                method.visitVarInsn(Opcodes.ALOAD, 1);
                method.visitVarInsn(Opcodes.ALOAD, 2);
                method.visitMethodInsn(
                        Opcodes.INVOKESTATIC,
                        "com/zhiqu/server/magic/MagicImageApi",
                        "generate",
                        TARGET_DESCRIPTOR,
                        false
                );
                method.visitInsn(Opcodes.ARETURN);
                method.visitMaxs(0, 0);
                method.visitEnd();
                super.visitEnd();
            }
        };
        reader.accept(visitor, 0);

        Path output = Path.of(args[1]);
        Files.createDirectories(output.getParent());
        Files.write(output, writer.toByteArray());
    }
}
