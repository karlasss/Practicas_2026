IDENTIFICATION DIVISION.
       PROGRAM-ID. FACTURA.
      *> Calcula el IVA (12%) y el ISR (5% / 7%) de una factura.
      *> El total de la factura ya trae el IVA incluido.

       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01 WS-ENTRADA      PIC X(20).
       01 WS-OTRA         PIC X     VALUE "S".
       01 WS-TOTAL        PIC 9(9)V99 VALUE 0.
       01 WS-BASE         PIC 9(9)V99 VALUE 0.
       01 WS-IVA          PIC 9(9)V99 VALUE 0.
       01 WS-ISR          PIC 9(9)V99 VALUE 0.
       01 WS-LIQUIDO      PIC 9(9)V99 VALUE 0.
       01 WS-LIMITE-ISR   PIC 9(9)V99 VALUE 30000.
       01 WS-EDITADO      PIC ZZZ,ZZZ,ZZ9.99.

       PROCEDURE DIVISION.
       INICIO.
           PERFORM UNTIL WS-OTRA = "N" OR WS-OTRA = "n"
               PERFORM PEDIR-TOTAL
               PERFORM CALCULAR
               PERFORM MOSTRAR
               DISPLAY "Calcular otra factura? (S/N): "
                   WITH NO ADVANCING
               ACCEPT WS-OTRA
           END-PERFORM
           DISPLAY "Fin del programa."
           STOP RUN.

       PEDIR-TOTAL.
           MOVE 0 TO WS-TOTAL
           PERFORM UNTIL WS-TOTAL > 0
               DISPLAY "Total de la factura (con IVA) Q: "
                   WITH NO ADVANCING
               ACCEPT WS-ENTRADA
               COMPUTE WS-TOTAL = FUNCTION NUMVAL(WS-ENTRADA)
               IF WS-TOTAL = 0
                   DISPLAY "Monto no valido, intenta de nuevo."
               END-IF
           END-PERFORM.

       CALCULAR.
      *>    Base sin IVA = total / 1.12
           COMPUTE WS-BASE ROUNDED = WS-TOTAL / 1.12
           COMPUTE WS-IVA = WS-TOTAL - WS-BASE
      *>    ISR: 5% hasta Q30,000; Q1,500 + 7% del excedente
           IF WS-BASE <= WS-LIMITE-ISR
               COMPUTE WS-ISR ROUNDED = WS-BASE * 0.05
           ELSE
               COMPUTE WS-ISR ROUNDED =
                   1500 + (WS-BASE - WS-LIMITE-ISR) * 0.07
           END-IF
           COMPUTE WS-LIQUIDO = WS-TOTAL - WS-ISR.

       MOSTRAR.
           DISPLAY " "
           DISPLAY "=========== DETALLE DE FACTURA ==========="
           MOVE WS-TOTAL TO WS-EDITADO
           DISPLAY "Total factura:        Q " WS-EDITADO
           MOVE WS-BASE TO WS-EDITADO
           DISPLAY "Base sin IVA:         Q " WS-EDITADO
           MOVE WS-IVA TO WS-EDITADO
           DISPLAY "IVA (12%):            Q " WS-EDITADO
           MOVE WS-ISR TO WS-EDITADO
           DISPLAY "ISR a retener:        Q " WS-EDITADO
           MOVE WS-LIQUIDO TO WS-EDITADO
           DISPLAY "Liquido a recibir:    Q " WS-EDITADO
           DISPLAY "=========================================="
           DISPLAY " ".


