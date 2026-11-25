!=====================================================================
! FACTURA - Calculo de IVA e ISR de una factura (Fortran / gfortran)
! Precios con IVA incluido (12%). ISR: 5% hasta Q30,000;
! Q1,500 + 7% sobre el excedente. Total a pagar = Total - ISR.
!=====================================================================
program factura
  implicit none
  integer, parameter :: dp = kind(1.0d0)
  integer, parameter :: MAX_ITEMS = 50
  real(dp), parameter :: TASA_IVA   = 0.12_dp
  real(dp), parameter :: TASA_ISR_1 = 0.05_dp
  real(dp), parameter :: TASA_ISR_2 = 0.07_dp
  real(dp), parameter :: LIMITE_ISR = 30000.0_dp

  character(len=40) :: cliente, nit
  character(len=30) :: descripcion(MAX_ITEMS)
  integer           :: cantidad(MAX_ITEMS)
  real(dp)          :: precio(MAX_ITEMS), importe(MAX_ITEMS)
  integer  :: n, i, ios
  real(dp) :: total, base, iva, isr, a_pagar

  write(*,'(A)') '=========================================='
  write(*,'(A)') '   CALCULO DE IVA E ISR DE UNA FACTURA'
  write(*,'(A)') '=========================================='
  write(*,'(A)', advance='no') 'Nombre del cliente: '
  read(*,'(A)') cliente
  write(*,'(A)', advance='no') 'NIT del cliente   : '
  read(*,'(A)') nit
  write(*,'(/,A)') 'Ingrese los productos (cantidad 0 para terminar).'

  n = 0
  do while (n < MAX_ITEMS)
     write(*,'(/,A,I0)') 'Producto #', n + 1
     write(*,'(A)', advance='no') '  Cantidad        : '
     read(*,*,iostat=ios) cantidad(n + 1)
     if (ios /= 0) then
        write(*,'(A)') '  ** Cantidad invalida, intente de nuevo.'
        cycle
     end if
     if (cantidad(n + 1) <= 0) exit
     write(*,'(A)', advance='no') '  Descripcion     : '
     read(*,'(A)') descripcion(n + 1)
     do
        write(*,'(A)', advance='no') '  Precio unitario : '
        read(*,*,iostat=ios) precio(n + 1)
        if (ios == 0 .and. precio(n + 1) >= 0.0_dp) exit
        write(*,'(A)') '  ** Precio invalido, intente de nuevo.'
     end do
     n = n + 1
     importe(n) = redondear(cantidad(n) * precio(n))
  end do

  if (n == 0) then
     write(*,'(/,A)') 'No se ingresaron productos. Fin del programa.'
     stop
  end if

  total   = redondear(sum(importe(1:n)))
  base    = redondear(total / (1.0_dp + TASA_IVA))
  iva     = redondear(total - base)
  isr     = redondear(calcular_isr(base))
  a_pagar = redondear(total - isr)

  write(*,'(/,A)') '=========================================================='
  write(*,'(A)')   '                        FACTURA'
  write(*,'(A)')   '=========================================================='
  write(*,'(A,A)') 'Cliente: ', trim(cliente)
  write(*,'(A,A)') 'NIT    : ', trim(nit)
  write(*,'(A)')   '----------------------------------------------------------'
  write(*,'(A)')   ' CANT DESCRIPCION                        P.UNIT     IMPORTE'
  write(*,'(A)')   '----------------------------------------------------------'
  do i = 1, n
     write(*,'(I5,1X,A30,F11.2,F12.2)') cantidad(i), descripcion(i), &
                                         precio(i), importe(i)
  end do
  write(*,'(A)')   '----------------------------------------------------------'
  write(*,'(A,F16.2)') 'Total factura (IVA incluido) : Q', total
  write(*,'(A,F16.2)') 'Base imponible (sin IVA)     : Q', base
  write(*,'(A,F16.2)') 'IVA 12%                      : Q', iva
  write(*,'(A,F16.2)') 'Retencion ISR                : Q', isr
  write(*,'(A)')       '----------------------------------------------------------'
  write(*,'(A,F16.2)') 'TOTAL A PAGAR (menos ISR)    : Q', a_pagar
  write(*,'(A)')       '=========================================================='

contains

  function calcular_isr(b) result(r)
    real(dp), intent(in) :: b
    real(dp) :: r
    if (b <= LIMITE_ISR) then
       r = b * TASA_ISR_1
    else
       r = LIMITE_ISR * TASA_ISR_1 + (b - LIMITE_ISR) * TASA_ISR_2
    end if
  end function calcular_isr

  function redondear(x) result(r)
    real(dp), intent(in) :: x
    real(dp) :: r
    r = anint(x * 100.0_dp) / 100.0_dp
  end function redondear

end program factura
