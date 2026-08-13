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
    private static final String SERVICE_OWNER = "com/zhiqu/server/magic/MagicGameService";
    private static final String CAST_REQUEST_OWNER = "com/zhiqu/server/magic/MagicGameDtos$CastRequest";
    private static final String IMAGE_API_OWNER = "com/zhiqu/server/magic/MagicImageApi";
    private static final String LIFECYCLE_OWNER = "com/zhiqu/server/game/GameRoomLifecycleCoordinator";
    private static final String LIFECYCLE_LEFT_DESCRIPTOR = "(Lcom/zhiqu/server/game/GameCode;Ljava/lang/String;Ljava/lang/String;)V";
    private static final String LIFECYCLE_CLOSED_DESCRIPTOR = "(Lcom/zhiqu/server/game/GameCode;Ljava/lang/String;Z)V";
    private static final String LOCKED_ROOM_DESCRIPTOR = "(Ljava/lang/String;)Lcom/zhiqu/server/magic/MagicGameRoomEntity;";
    private static final String GET_ROOM_DESCRIPTOR = "(Ljava/lang/String;Ljava/lang/String;)Lcom/zhiqu/server/magic/MagicGameDtos$MagicGameSnapshot;";
    private static final int GENERATED_IMAGE_LOCAL = 8;

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
                MethodVisitor delegate = super.visitMethod(access, name, descriptor, signature, exceptions);
                boolean isMentorCast = "castMentor".equals(name);
                boolean isNoviceCast = "castNovice".equals(name);
                boolean isLeave = "leave".equals(name)
                        && "(Ljava/lang/String;Ljava/lang/String;)V".equals(descriptor);
                if (!isMentorCast && !isNoviceCast && !isLeave) {
                    return delegate;
                }
                return new MethodVisitor(Opcodes.ASM7, delegate) {
                    private boolean generatedBeforeRoomLock;

                    @Override
                    public void visitMethodInsn(int opcode, String owner, String methodName, String methodDescriptor, boolean isInterface) {
                        if (isMentorCast
                                && !generatedBeforeRoomLock
                                && opcode == Opcodes.INVOKEVIRTUAL
                                && SERVICE_OWNER.equals(owner)
                                && "lockedRoom".equals(methodName)
                                && LOCKED_ROOM_DESCRIPTOR.equals(methodDescriptor)) {
                            // Confirm that the caller belongs to this room, then generate
                            // before acquiring the room's pessimistic row lock. The
                            // image provider can take seconds, while the final state update is fast.
                            super.visitVarInsn(Opcodes.ALOAD, 0);
                            super.visitVarInsn(Opcodes.ALOAD, 1);
                            super.visitVarInsn(Opcodes.ALOAD, 2);
                            super.visitMethodInsn(
                                    Opcodes.INVOKEVIRTUAL,
                                    SERVICE_OWNER,
                                    "get",
                                    GET_ROOM_DESCRIPTOR,
                                    false
                            );
                            super.visitInsn(Opcodes.POP);
                            super.visitVarInsn(Opcodes.ALOAD, 2);
                            super.visitVarInsn(Opcodes.ALOAD, 3);
                            super.visitMethodInsn(
                                    Opcodes.INVOKEVIRTUAL,
                                    CAST_REQUEST_OWNER,
                                    "terms",
                                    "()Ljava/util/List;",
                                    false
                            );
                            super.visitVarInsn(Opcodes.ALOAD, 0);
                            super.visitInsn(Opcodes.SWAP);
                            super.visitMethodInsn(
                                    Opcodes.INVOKEVIRTUAL,
                                    SERVICE_OWNER,
                                    "normalizedTerms",
                                    "(Ljava/util/List;)Ljava/util/List;",
                                    false
                            );
                            super.visitMethodInsn(
                                    Opcodes.INVOKESTATIC,
                                    IMAGE_API_OWNER,
                                    "generate",
                                    TARGET_DESCRIPTOR,
                                    false
                            );
                            super.visitVarInsn(Opcodes.ASTORE, GENERATED_IMAGE_LOCAL);
                            generatedBeforeRoomLock = true;
                        }
                        if (opcode == Opcodes.INVOKEVIRTUAL
                                && SERVICE_OWNER.equals(owner)
                                && TARGET_METHOD.equals(methodName)
                                && TARGET_DESCRIPTOR.equals(methodDescriptor)) {
                            if (isNoviceCast) {
                                // A guess completes the matching round. Do not make the
                                // player wait for a second external image-generation job;
                                // the room entity moves straight to RESULT with the answer.
                                super.visitInsn(Opcodes.POP);
                                super.visitInsn(Opcodes.POP);
                                super.visitInsn(Opcodes.POP);
                                super.visitLdcInsn("");
                                return;
                            }
                            super.visitInsn(Opcodes.POP);
                            super.visitInsn(Opcodes.POP);
                            super.visitInsn(Opcodes.POP);
                            super.visitVarInsn(Opcodes.ALOAD, GENERATED_IMAGE_LOCAL);
                            return;
                        }
                        if (isLeave
                                && opcode == Opcodes.INVOKEINTERFACE
                                && LIFECYCLE_OWNER.equals(owner)
                                && "left".equals(methodName)
                                && LIFECYCLE_LEFT_DESCRIPTOR.equals(methodDescriptor)) {
                            // A public listing represents an available room, not a reusable
                            // room shell. Once a novice leaves, close the listing so it cannot
                            // reappear as 1/2 and invite another player into the old session.
                            super.visitInsn(Opcodes.POP);
                            super.visitInsn(Opcodes.ICONST_0);
                            super.visitMethodInsn(
                                    Opcodes.INVOKEINTERFACE,
                                    LIFECYCLE_OWNER,
                                    "closed",
                                    LIFECYCLE_CLOSED_DESCRIPTOR,
                                    true
                            );
                            return;
                        }
                        super.visitMethodInsn(opcode, owner, methodName, methodDescriptor, isInterface);
                    }
                };
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
                        IMAGE_API_OWNER,
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
